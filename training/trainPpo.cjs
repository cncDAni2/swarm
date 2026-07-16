const fs = require('fs/promises');
const path = require('path');

const OBSERVATION_SIZE = 265;
const ACTION_HEADS = {
    movement: { offset: 0, size: 9 },
    aimDirection: { offset: 9, size: 16 },
    fire: { offset: 25, size: 2 }
};
const ACTOR_OUTPUT_SIZE = 27;
const PPO_OUTPUT_SIZE = 28;

function loadTensorFlow() {
    try {
        const tf = require('@tensorflow/tfjs-node-gpu');
        console.log('TensorFlow backend: tfjs-node-gpu');
        return tf;
    } catch {
        try {
            const tf = require('@tensorflow/tfjs-node');
            console.log('TensorFlow backend: tfjs-node (CPU)');
            return tf;
        } catch {
            const tf = require('@tensorflow/tfjs');
            console.log('TensorFlow backend: tfjs (JavaScript CPU fallback)');
            return tf;
        }
    }
}

function parseArguments() {
    const args = process.argv.slice(2);
    const read = flag => {
        const index = args.indexOf(flag);
        return index === -1 ? undefined : args[index + 1];
    };
    const positiveInteger = (value, fallback) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
        rolloutDirectory: read('--rollouts') || (process.env.APPDATA
            ? path.join(process.env.APPDATA, 'swarm', 'training', 'rollouts')
            : path.join(process.cwd(), 'training', 'data', 'rollouts')),
        modelDirectory: read('--model') || path.join(__dirname, 'models', 'imitation-policy'),
        epochs: positiveInteger(read('--epochs'), 8),
        batchSize: positiveInteger(read('--batch-size'), 512),
        learningRate: 0.0002,
        clipRange: 0.2,
        gamma: 0.995
    };
}

async function loadRollouts(directory) {
    try {
        await fs.access(directory);
    } catch {
        throw new Error(
            `Neural rollout directory does not exist: ${directory}\n` +
            'Run "npm run collect-rollouts -- 50000" with the current neural policy before PPO training.'
        );
    }
    const files = (await fs.readdir(directory)).filter(file => file.endsWith('.jsonl'));
    const transitions = [];
    const validFiles = [];
    const skippedFiles = [];
    for (const file of files) {
        const content = await fs.readFile(path.join(directory, file), 'utf8');
        const fileTransitions = [];
        let valid = true;
        for (const line of content.split('\n')) {
            if (!line) continue;
            const transition = JSON.parse(line);
            if (
                transition.state?.length !== OBSERVATION_SIZE ||
                !Number.isFinite(transition.policy?.logProbability) ||
                !Number.isFinite(transition.policy?.value)
            ) {
                valid = false;
                break;
            }
            fileTransitions.push(transition);
        }
        if (valid) {
            transitions.push(...fileTransitions);
            validFiles.push(file);
        } else {
            skippedFiles.push(file);
        }
    }
    if (transitions.length === 0) throw new Error(`No neural rollout transitions found in ${directory}`);
    if (skippedFiles.length > 0) {
        console.warn(`Skipped ${skippedFiles.length} non-PPO rollout files created before the policy model was ready.`);
    }
    return { files: validFiles, transitions };
}

function discountedAdvantages(transitions, gamma) {
    const returns = new Array(transitions.length);
    let runningReturn = 0;
    for (let index = transitions.length - 1; index >= 0; index--) {
        const transition = transitions[index];
        runningReturn = transition.reward + (transition.done ? 0 : gamma * runningReturn);
        returns[index] = runningReturn;
    }
    const advantages = returns.map((value, index) => value - transitions[index].policy.value);
    const mean = advantages.reduce((sum, value) => sum + value, 0) / advantages.length;
    const variance = advantages.reduce((sum, value) => sum + (value - mean) ** 2, 0) / advantages.length;
    const scale = Math.sqrt(variance) + 1e-8;
    return { returns, advantages: advantages.map(value => (value - mean) / scale) };
}

function createPpoModel(tf) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [OBSERVATION_SIZE], units: 256, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: PPO_OUTPUT_SIZE, activation: 'linear' }));
    return model;
}

async function loadPolicy(tf, modelDirectory) {
    const modelJson = JSON.parse(await fs.readFile(path.join(modelDirectory, 'model.json'), 'utf8'));
    const manifest = modelJson.weightsManifest?.[0];
    if (!modelJson.modelTopology || !manifest?.weights || !manifest?.paths?.[0]) {
        throw new Error(`Invalid model artifacts in ${modelDirectory}`);
    }
    const weightData = await fs.readFile(path.join(modelDirectory, manifest.paths[0]));
    const previous = await tf.loadLayersModel(tf.io.fromMemory({
        modelTopology: modelJson.modelTopology,
        weightSpecs: manifest.weights,
        weightData: weightData.buffer.slice(weightData.byteOffset, weightData.byteOffset + weightData.byteLength)
    }));
    if (previous.outputs[0].shape[1] === PPO_OUTPUT_SIZE) return previous;
    if (previous.outputs[0].shape[1] !== ACTOR_OUTPUT_SIZE) throw new Error('Model must have 27 actor logits or 28 PPO outputs');

    const model = createPpoModel(tf);
    model.layers[0].setWeights(previous.layers[0].getWeights());
    model.layers[1].setWeights(previous.layers[1].getWeights());
    const [actorKernel, actorBias] = previous.layers[2].getWeights();
    const kernel = tf.concat([actorKernel, tf.zeros([actorKernel.shape[0], 1])], 1);
    const bias = tf.concat([actorBias, tf.zeros([1])], 0);
    model.layers[2].setWeights([kernel, bias]);
    kernel.dispose();
    bias.dispose();
    previous.dispose();
    return model;
}

function actionLogProbability(tf, logits, labels) {
    const parts = [];
    for (const [column, head] of Object.entries(ACTION_HEADS).map(([name, head], index) => [index, head])) {
        const headLogits = logits.slice([0, head.offset], [-1, head.size]);
        const headLabels = labels.slice([0, column], [-1, 1]).asType('int32').squeeze([1]);
        const selected = tf.sum(tf.mul(tf.oneHot(headLabels, head.size), tf.logSoftmax(headLogits)), 1);
        parts.push(selected);
    }
    return tf.addN(parts);
}

function ppoLoss(tf, model, states, targets, clipRange) {
    return tf.tidy(() => {
        const labels = targets.slice([0, 0], [-1, 3]);
        const oldLogProbability = targets.slice([0, 3], [-1, 1]).squeeze([1]);
        const advantages = targets.slice([0, 4], [-1, 1]).squeeze([1]);
        const returns = targets.slice([0, 5], [-1, 1]).squeeze([1]);
        const output = model.apply(states);
        const logits = output.slice([0, 0], [-1, ACTOR_OUTPUT_SIZE]);
        const values = output.slice([0, ACTOR_OUTPUT_SIZE], [-1, 1]).squeeze([1]);
        const currentLogProbability = actionLogProbability(tf, logits, labels);
        const ratio = tf.exp(currentLogProbability.sub(oldLogProbability));
        const unclipped = ratio.mul(advantages);
        const clipped = tf.clipByValue(ratio, 1 - clipRange, 1 + clipRange).mul(advantages);
        const actorLoss = tf.mean(tf.minimum(unclipped, clipped)).neg();
        const valueLoss = tf.mean(tf.square(values.sub(returns))).mul(0.5);
        return actorLoss.add(valueLoss.mul(0.5));
    });
}

async function saveModel(tf, model, outputDirectory, metadata) {
    await fs.mkdir(outputDirectory, { recursive: true });
    await model.save(tf.io.withSaveHandler(async artifacts => {
        await fs.writeFile(path.join(outputDirectory, 'model.json'), JSON.stringify({
            format: 'layers-model',
            generatedBy: `TensorFlow.js v${tf.version.tfjs}`,
            convertedBy: null,
            modelTopology: artifacts.modelTopology,
            weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
        }, null, 2));
        await fs.writeFile(path.join(outputDirectory, 'weights.bin'), Buffer.from(artifacts.weightData));
        return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));
    await fs.writeFile(path.join(outputDirectory, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

async function archiveRollouts(rolloutDirectory, files) {
    const archiveDirectory = path.join(rolloutDirectory, 'archive', new Date().toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(archiveDirectory, { recursive: true });
    for (const file of files) {
        const sessionId = file.slice(0, -'.jsonl'.length);
        for (const suffix of ['.jsonl', '.metadata.json', '.complete']) {
            const source = path.join(rolloutDirectory, `${sessionId}${suffix}`);
            try {
                await fs.rename(source, path.join(archiveDirectory, `${sessionId}${suffix}`));
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }
    return archiveDirectory;
}

async function main() {
    const options = parseArguments();
    const tf = loadTensorFlow();
    const rollout = await loadRollouts(options.rolloutDirectory);
    const { returns, advantages } = discountedAdvantages(rollout.transitions, options.gamma);
    const count = rollout.transitions.length;
    console.log(`Loaded ${count} on-policy transitions from ${rollout.files.length} rollout files.`);

    const states = tf.tensor2d(rollout.transitions.flatMap(transition => transition.state), [count, OBSERVATION_SIZE]);
    const targets = tf.tensor2d(rollout.transitions.flatMap((transition, index) => [
        transition.action.movement,
        transition.action.aimDirection,
        transition.action.fire ? 1 : 0,
        transition.policy.logProbability,
        advantages[index],
        returns[index]
    ]), [count, 6]);
    const model = await loadPolicy(tf, options.modelDirectory);
    const optimizer = tf.train.adam(options.learningRate);

    for (let epoch = 0; epoch < options.epochs; epoch++) {
        const order = tf.util.createShuffledIndices(count);
        let lossTotal = 0;
        let batches = 0;
        for (let start = 0; start < count; start += options.batchSize) {
            const batchIndices = Int32Array.from(order.slice(start, start + options.batchSize));
            const indices = tf.tensor1d(batchIndices, 'int32');
            const batchStates = tf.gather(states, indices);
            const batchTargets = tf.gather(targets, indices);
            const result = tf.variableGrads(() => ppoLoss(tf, model, batchStates, batchTargets, options.clipRange));
            optimizer.applyGradients(result.grads);
            lossTotal += result.value.dataSync()[0];
            batches++;
            indices.dispose();
            batchStates.dispose();
            batchTargets.dispose();
            result.value.dispose();
            Object.values(result.grads).forEach(gradient => gradient.dispose());
        }
        console.log(`PPO epoch ${epoch + 1}/${options.epochs}: loss=${(lossTotal / batches).toFixed(4)}`);
    }

    await saveModel(tf, model, options.modelDirectory, {
        schemaVersion: 1,
        observationSize: OBSERVATION_SIZE,
        outputSize: PPO_OUTPUT_SIZE,
        actorOutputSize: ACTOR_OUTPUT_SIZE,
        actionHeads: ACTION_HEADS,
        decisionIntervalMs: 250,
        algorithm: 'ppo',
        training: {
            transitions: count,
            rolloutFiles: rollout.files,
            epochs: options.epochs,
            batchSize: options.batchSize,
            backend: tf.getBackend(),
            createdAt: new Date().toISOString()
        }
    });
    const archiveDirectory = await archiveRollouts(options.rolloutDirectory, rollout.files);
    states.dispose();
    targets.dispose();
    model.dispose();
    console.log(`Saved PPO policy to ${options.modelDirectory}`);
    console.log(`Archived consumed rollouts to ${archiveDirectory}`);
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});