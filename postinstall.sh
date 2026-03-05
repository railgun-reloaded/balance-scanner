#!/usr/bin/env bash
cd ./node_modules/@reloaded/storage \
  && npm install \
  && npm run build \
  && cd ../../.. \
  && cd ./node_modules/@railgun-reloaded/wallet-node \
  && npm install \
  && npm run build \
  && cd ../../.. \
  && cd ./node_modules/@railgun-reloaded/scanner \
  && npm install \
  && npm run build
