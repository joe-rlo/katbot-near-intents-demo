#!/bin/bash
# Git push with PAT authentication
# Usage: git-push-with-pat.sh [branch]
BRANCH=${1:-main}
GH_PAT="YOUR_PAT_HERE"  # You'll need to replace this with your actual PAT
git push https://$GH_PAT@github.com/joe/near-intents-swap.git $BRANCH