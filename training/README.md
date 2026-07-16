# GPU Training Machine

Collect episodes in the Electron game. They are saved under:

```text
%APPDATA%/swarm/training/episodes
```

For automatic, accelerated collection, run this from the repository root. The default target is 50,000 transitions; passing a number changes it:

```powershell
npm run collect-data
npm run collect-data -- 100000
```

The Electron window title displays the completed transition count. The collector does not render frames or play game audio, automatically starts a new episode on death, and stops after completing the first episode that reaches the target.

The game code and the trainer live in the same repository checkout. Episode files are user data, so Git does not copy them between machines. Run Electron with **BOT MÓD** enabled on the machine where you want to train, or copy completed `.jsonl` files and their matching `.metadata.json` files into a local folder.

Validate the episodes produced by Electron on Windows with:

```powershell
npm run check-training-data
```

This defaults to `%APPDATA%\swarm\training\episodes`. To validate copied data elsewhere, pass its directory explicitly:

```powershell
npm run check-training-data -- "C:\path\to\episodes"
```

Generate the portable, untrained actor model from the game repository with:

```powershell
npm run create-initial-model
```

For an RTX 5070, the trainer can run from this same checkout in Linux or WSL2. Install a current NVIDIA driver, CUDA libraries compatible with the installed TensorFlow.js Node GPU package, Node.js LTS, and then install `@tensorflow/tfjs-node-gpu` in that environment. The game itself does not need this native package.

Train the first policy after collection with:

```powershell
npm install --no-save @tensorflow/tfjs-node-gpu
npm run train-imitation
```

The trainer automatically reads `%APPDATA%\swarm\training\episodes` and exports the policy to `training/models/imitation-policy`. It uses the GPU package when installed, otherwise falls back to CPU. Optional parameters are available for a different data folder or training duration:

```powershell
npm run train-imitation -- --epochs 40 --batch-size 1024
npm run train-imitation -- --data "C:\path\to\episodes" --output "C:\path\to\model"
```

The trainer reads the JSONL episodes, trains on the GPU, and exports `model.json`, `weights.bin`, and an updated `metadata.json`. Those three files are the model artifact to import back into the Electron game.

Each JSONL line is one imitation-learning transition: current observation (`state`), the heuristic bot's discrete action (`action`), reward, next observation (`nextState`), and the terminal flag (`done`). The first trainer will use `state` and `action` to reproduce the heuristic bot, then later reinforcement learning can use reward, nextState, and done to improve it.
