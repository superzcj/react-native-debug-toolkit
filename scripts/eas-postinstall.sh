#!/usr/bin/env bash
# react-native-debug-toolkit: EAS Build postInstall hook
# Usage in eas.json:
#   "postInstall": "bash node_modules/react-native-debug-toolkit/scripts/eas-postinstall.sh"
set -e
npx debug-toolkit embed --yes
