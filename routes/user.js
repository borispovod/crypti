
/*
 * GET users listing.
 */

exports.list = function(req, res){
  res.send("respond with a resource");
};

function auth(username, pswrd){
    return getHash(username + pswrd);
}

/**
 * Get hash sum
 * @param input
 * @returns {*}
 */
function getHash(input){
    try{
        var shasum = require('crypto').createHash('sha1');
        shasum.update(input);
        return shasum.digest('hex');
    } catch (e) {
        log.info('Произошла ошибка: ' + e.value);
    }
}
module.exports.auth = auth;

/*
 1. сделать router который принимает логин и пароль
 2. делает из них хеш
 3. вызывает получение publicKey
 */
var curve = require('libs/curve25519');
var curve2 = require('libs/curve');
module.exports.getPublicKey = function(hash){
    var inp = hash.split('');
    curve.keygen(inp,null,getHash(hash));
    return curve2.curve(inp);
}

module.exports.getPrivateKey = function(hash){
    var inp = hash.split('');
    curve.keygen(inp,null,getHash(hash));
    return curve2.curve(inp,curve2.curve(inp)).join('');
}