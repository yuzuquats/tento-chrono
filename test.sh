#!/bin/sh

deno test \
  --allow-net \
  --allow-read \
  --unsafely-ignore-certificate-errors \
  --config ./tests/deno.json \
  --no-check \
  --unstable-sloppy-imports \
  $@
