#!/bin/bash

if [ -z "NODE" ]; then
    NODE=node
fi

$NODE node_modules/.bin/mocha -t 2000 test/test.js
$NODE node_modules/.bin/mocha -t 10000 test/ui/login.js