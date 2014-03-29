var hexChars = new Array('0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f');

/**
 * Convert NULL to zero value
 * @param input
 * @returns {number}
 */
module.exports.nullToZero = function(input){
    return input == null ? 0 : input;
}
/**
 * Array to HEX string
 * @param bytes
 * @returns {string}
 */
module.exports.toHexString = function(bytes) {
    var chars = new Array(bytes.length * 2);
    for (var i = 0; i < bytes.length; i++) {
        chars[i * 2] = hexChars[((bytes[i] >> 4) & 0xF)];
        chars[i * 2 + 1] = hexChars[(bytes[i] & 0xF)];
    }
    return chars.join('');
}

module.exports.two64 = 18446744073709551616;
var bignum = require('bignum');

module.exports.toUnsignedLong = function(objectId) {
    objectId =  objectId == null ? 0 : objectId;
    if (objectId >= 0) {
        return objectId + "";
    }
    var id = bignum.toBuffer(objectId).add(two64);
    return id.toString();
}