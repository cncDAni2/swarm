const fs = require('fs/promises');
const path = require('path');
const tf = require('@tensorflow/tfjs');

const OBSERVATION_SIZE = 265;
const OUTPUT_SIZE = 27;
const outputDirectory = path.join(__dirname, 'models', 'initial-policy');

async function saveModel(model) {
    await fs.mkdir(outputDirectory, { recursive: true });

    await model.save(tf.io.withSaveHandler(async artifacts => {
        const modelJson = {
            format: 'layers-model',
            generatedBy: `TensorFlow.js v${tf.version.tfjs}`,
            convertedBy: null,
            modelTopology: artifacts.modelTopology,
            weightsManifest: [{
                paths: ['weights.bin'],
                weights: artifacts.weightSpecs
            }]
        };

        await fs.writeFile(path.join(outputDirectory, 'model.json'), JSON.stringify(modelJson, null, 2));
        await fs.writeFile(path.join(outputDirectory, 'weights.bin'), Buffer.from(artifacts.weightData));

        return {
            modelArtifactsInfo: {
                dateSaved: new Date(),
                modelTopologyType: 'JSON',
                modelTopologyBytes: JSON.stringify(artifacts.modelTopology).length,
                weightSpecsBytes: JSON.stringify(artifacts.weightSpecs).length,
                weightDataBytes: artifacts.weightData.byteLength
            }
        };
    }));
}

async function main() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [OBSERVATION_SIZE], units: 256, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: OUTPUT_SIZE, activation: 'linear' }));

    await saveModel(model);
    await fs.writeFile(path.join(outputDirectory, 'metadata.json'), JSON.stringify({
        schemaVersion: 1,
        observationSize: OBSERVATION_SIZE,
        outputSize: OUTPUT_SIZE,
        actionHeads: {
            movement: { offset: 0, size: 9 },
            aimDirection: { offset: 9, size: 16 },
            fire: { offset: 25, size: 2 }
        },
        decisionIntervalMs: 250,
        algorithm: 'untrained-actor',
        createdAt: new Date().toISOString()
    }, null, 2));

    console.log(`Initial model created in ${outputDirectory}`);
    model.dispose();
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});