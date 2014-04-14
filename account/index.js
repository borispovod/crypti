var bignum = require('bignum');
var crypto = require('crypto');
module.exports.getID = function (publicKey) {
    var shasum = crypto.createHash('sha256');
    shasum.update(publicKey, 'utf8');
    var publicKeyHash = shasum.digest();
    var temp = new Buffer(8);
    for (var i = 0; i < 8; i++) {
        temp[i] = publicKeyHash[7-i];
    }
    var bigInteger = bignum.fromBuffer(temp).toString() + "C";
    return bigInteger.toNumber();
}

module.exports.getAccount = function(id){

}