var crypto = require('crypto');
var ed25519 = require('./');

var buf = crypto.randomBytes(32);

var keyPair = ed25519.MakeKeypair(buf);
console.log(keyPair);


var message = new Buffer('Hello There!!', 'utf8');
var hash = new Buffer('2c74fd17edafd80e8447b0d46741ee243b7eb74dd2149a0ab1b9246fb30382f2', 'hex');
var keyPair = ed25519.MakeKeypair(hash);

console.log(keyPair.publicKey.toString('hex'));
console.log(keyPair.privateKey.toString('hex'));

var sig1 = ed25519.Sign(message, hash);
var sig2 = ed25519.Sign(message, keyPair);

console.log(sig1.toString('hex'));
console.log(sig2.toString('hex'));
console.log(sig2.length);
// console.log(sig3.toString('hex'));

sig1[23] = 73;
console.log(sig1.toString('hex'));
console.log(sig2.toString('hex'));
console.log(ed25519.Verify(message, sig1, keyPair.publicKey));
console.log(ed25519.Verify(message, sig2, keyPair.publicKey));
// console.log(ed25519.Verify(message, sig3, keyPair.publicKey));


/*
bc696b6ef4673adb4895df60be8661ff537e150f0bfebb48f46257e9a569dd4ea8ef2456f7bcc1ca61f6ad3da799657936c7cd8ad812454882898f2dcd3d7403
bc696b6ef4673adb4895df60be8661ff537e150f0bfebb48f46257e9a569dd4ea8ef2456f7bcc1ca61f6ad3da799657936c7cd8ad812454882898f2dcd3d7403
bc696b6ef4673adb4895df60be8661ff537e150f0bfebb48f46257e9a569dd4ea8ef2456f7bcc1ca61f6ad3da799657936c7cd8ad812454882898f2dcd3d7403
*/

