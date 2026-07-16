const fs = require('fs/promises');
const path = require('path');

const observationSize = 265;

async function main() {
    const directory = process.argv[2];
    if (!directory) {
        throw new Error('Usage: npm run check-training-data -- <episode-directory>');
    }

    const files = (await fs.readdir(directory)).filter(file => file.endsWith('.jsonl'));
    let transitions = 0;
    for (const file of files) {
        const content = await fs.readFile(path.join(directory, file), 'utf8');
        for (const line of content.split('\n')) {
            if (!line) continue;
            const transition = JSON.parse(line);
            if (transition.state.length !== observationSize || transition.nextState.length !== observationSize) {
                throw new Error(`${file} has an invalid observation size`);
            }
            if (!Number.isInteger(transition.action.movement) || !Number.isInteger(transition.action.aimDirection)) {
                throw new Error(`${file} has an invalid action`);
            }
            transitions++;
        }
    }
    console.log(`Validated ${transitions} transitions from ${files.length} episode files.`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});