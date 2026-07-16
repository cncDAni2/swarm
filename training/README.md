# GPU Training Machine

Collect episodes in the Electron game. They are saved under:

```text
%APPDATA%/swarm/training/episodes
```

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

The trainer reads the JSONL episodes, trains on the GPU, and exports `model.json`, `weights.bin`, and an updated `metadata.json`. Those three files are the model artifact to import back into the Electron game.
