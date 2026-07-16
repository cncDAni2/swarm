const fs = require('fs/promises');
const path = require('path');

const OBSERVATION_SIZE = 265;
const ACTION_HEADS = {
    movement: { offset: 0, size: 9 },
    aimDirection: { offset: 9, size: 16 },
    fire: { offset: 25, size: 2 }
};
const OUTPUT_SIZE = 27;

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
    const valueAfter = flag => {
        const index = args.indexOf(flag);
        return index === -1 ? undefined : args[index + 1];
    };
    const asPositiveInteger = (value, fallback) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
        dataDirectory: valueAfter('--data') || (
            process.env.APPDATA
                ? path.join(process.env.APPDATA, 'swarm', 'training', 'episodes')
                : path.join(process.cwd(), 'training', 'data', 'episodes')
        ),
        outputDirectory: valueAfter('--output') || path.join(__dirname, 'models', 'imitation-policy'),
        epochs: asPositiveInteger(valueAfter('--epochs'), 25),
        batchSize: asPositiveInteger(valueAfter('--batch-size'), 512)
    };
}

async function loadDataset(directory) {
    const files = (await fs.readdir(directory)).filter(file => file.endsWith('.jsonl'));
    if (files.length === 0) throw new Error(`No episode files found in ${directory}`);

    const states = [];
    const labels = [];
    for (const file of files) {
        const content = await fs.readFile(path.join(directory, file), 'utf8');
        for (const line of content.split('\n')) {
            if (!line) continue;
            const transition = JSON.parse(line);
            const { state, action } = transition;
            if (!Array.isArray(state) || state.length !== OBSERVATION_SIZE) {
                throw new Error(`${file} contains an invalid observation`);
            }
            if (
                !Number.isInteger(action?.movement) || action.movement < 0 || action.movement >= ACTION_HEADS.movement.size ||
                !Number.isInteger(action?.aimDirection) || action.aimDirection < 0 || action.aimDirection >= ACTION_HEADS.aimDirection.size ||
                typeof action?.fire !== 'boolean'
            ) {
                throw new Error(`${file} contains an invalid teacher action`);
            }
            states.push(...state);
            labels.push(action.movement, action.aimDirection, action.fire ? 1 : 0);
        }
    }
    if (labels.length === 0) throw new Error(`No transitions found in ${directory}`);
    return { files: files.length, transitions: labels.length / 3, states, labels };
}

function createPolicy(tf) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [OBSERVATION_SIZE], units: 256, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: OUTPUT_SIZE, activation: 'linear' }));
    return model;
}

function imitationLoss(tf) {
    return (labels, logits) => tf.tidy(() => {
        const movementLabels = labels.slice([0, ACTION_HEADS.movement.offset], [-1, ACTION_HEADS.movement.size]);
        const aimLabels = labels.slice([0, ACTION_HEADS.aimDirection.offset], [-1, ACTION_HEADS.aimDirection.size]);
        const fireLabels = labels.slice([0, ACTION_HEADS.fire.offset], [-1, ACTION_HEADS.fire.size]);
        const movementLogits = logits.slice([0, ACTION_HEADS.movement.offset], [-1, ACTION_HEADS.movement.size]);
        const aimLogits = logits.slice([0, ACTION_HEADS.aimDirection.offset], [-1, ACTION_HEADS.aimDirection.size]);
        const fireLogits = logits.slice([0, ACTION_HEADS.fire.offset], [-1, ACTION_HEADS.fire.size]);

        const movementLoss = tf.losses.softmaxCrossEntropy(movementLabels, movementLogits);
        const aimLoss = tf.losses.softmaxCrossEntropy(aimLabels, aimLogits);
        const fireLoss = tf.losses.softmaxCrossEntropy(fireLabels, fireLogits);
        return tf.mean(tf.addN([movementLoss, aimLoss, fireLoss]));
    });
}

function createOneHotTargets(tf, rawLabels) {
    return tf.tidy(() => {
        const columns = tf.unstack(rawLabels, 1);
        const targets = tf.concat([
            tf.oneHot(columns[0].asType('int32'), ACTION_HEADS.movement.size),
            tf.oneHot(columns[1].asType('int32'), ACTION_HEADS.aimDirection.size),
            tf.oneHot(columns[2].asType('int32'), ACTION_HEADS.fire.size)
        ], 1);
        columns.forEach(column => column.dispose());
        return targets;
    });
}

async function calculateAccuracy(tf, model, inputs, targets) {
    const logits = model.predict(inputs);
    const results = {};
    for (const [name, head] of Object.entries(ACTION_HEADS)) {
        const prediction = logits.slice([0, head.offset], [-1, head.size]).argMax(1);
        const expected = targets.slice([0, head.offset], [-1, head.size]).argMax(1);
        const accuracy = prediction.equal(expected).cast('float32').mean().dataSync()[0];
        results[name] = accuracy;
        prediction.dispose();
        expected.dispose();
    }
    logits.dispose();
    return results;
}

async function savePolicy(tf, model, outputDirectory, metadata) {
    await fs.mkdir(outputDirectory, { recursive: true });
    await model.save(tf.io.withSaveHandler(async artifacts => {
        const modelJson = {
            format: 'layers-model',
            generatedBy: `TensorFlow.js v${tf.version.tfjs}`,
            convertedBy: null,
            modelTopology: artifacts.modelTopology,
            weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
        };
        await fs.writeFile(path.join(outputDirectory, 'model.json'), JSON.stringify(modelJson, null, 2));
        await fs.writeFile(path.join(outputDirectory, 'weights.bin'), Buffer.from(artifacts.weightData));
        return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));
    await fs.writeFile(path.join(outputDirectory, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

async function main() {
    const options = parseArguments();
    const tf = loadTensorFlow();
    await fs.access(options.dataDirectory);
    const dataset = await loadDataset(options.dataDirectory);
    console.log(`Loaded ${dataset.transitions} transitions from ${dataset.files} episode files.`);

    const inputs = tf.tensor2d(dataset.states, [dataset.transitions, OBSERVATION_SIZE]);
    const rawLabels = tf.tensor2d(dataset.labels, [dataset.transitions, 3], 'int32');
    const targets = createOneHotTargets(tf, rawLabels);
    rawLabels.dispose();
    const model = createPolicy(tf);
    model.compile({ optimizer: tf.train.adam(0.0005), loss: imitationLoss(tf) });

    await model.fit(inputs, targets, {
        batchSize: Math.min(options.batchSize, dataset.transitions),
        epochs: options.epochs,
        validationSplit: 0.1,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1}/${options.epochs}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
            }
        }
    });

    const accuracy = await calculateAccuracy(tf, model, inputs, targets);
    await savePolicy(tf, model, options.outputDirectory, {
        schemaVersion: 1,
        observationSize: OBSERVATION_SIZE,
        outputSize: OUTPUT_SIZE,
        actionHeads: ACTION_HEADS,
        decisionIntervalMs: 250,
        algorithm: 'behavioral-cloning',
        training: {
            transitions: dataset.transitions,
            episodes: dataset.files,
            epochs: options.epochs,
            batchSize: options.batchSize,
            accuracy,
            backend: tf.getBackend(),
            createdAt: new Date().toISOString()
        }
    });

    console.log(`Saved imitation policy to ${options.outputDirectory}`);
    console.log(`Training accuracy: movement=${accuracy.movement.toFixed(3)}, aim=${accuracy.aimDirection.toFixed(3)}, fire=${accuracy.fire.toFixed(3)}`);
    inputs.dispose();
    targets.dispose();
    model.dispose();
}

main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});