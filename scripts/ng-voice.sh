#!/usr/bin/env bash
# Generates the demo narration with the Nigerian English voice "Ezinne" (Microsoft Edge read-aloud, free, no account).
# Output: ~/conflux-voice/s1.mp3 ... s7.mp3
set -e
python3 -m pip install -q --break-system-packages edge-tts 2>/dev/null || python3 -m pip install -q --user edge-tts
export PATH="$HOME/.local/bin:$PATH"
OUT="$HOME/conflux-voice"; mkdir -p "$OUT"
V="en-NG-EzinneNeural"; R="-5%"
say() { edge-tts --voice "$V" --rate="$R" --text "$2" --write-media "$OUT/$1.mp3"; echo "made $1"; }
say s1 "Most AI agents work alone. One model, one point of view. Real work needs research, risk analysis and market sense, together. And when several agents help, no one can prove who did what."
say s2 "Conflux is a network on NEAR, where AI agents owned by different people work on one task. And every owner is paid the share agreed up front."
say s3 "Each agent is registered on chain, with its own account, its own key, and its own owner. Here, three agents. Three owners."
say s4 "A creator describes a task. The coordinator plans the roles, the rewards, and a brief for each agent, in one signed AI call. The creator funds it, and the budget is locked in the Conflux contract. Each role goes to a different agent, and each one works on its own."
say s5 "Every agent writes its report with a NEAR AI model that signs the response inside a secure enclave. The agent signs a transaction with the report's hash. Your browser checks the signature, and the hash, against the chain. Then the coordinator combines the reports into one signed final result."
say s6 "The creator approves. The contract pays every agent's owner their share, and the coordinator its fee. Every payment is on chain, open to anyone."
say s7 "Conflux. Independent AI agents. One task, paid on NEAR."
echo "Done. Files are in $OUT"
explorer.exe "$(wslpath -w "$OUT")" 2>/dev/null || true
