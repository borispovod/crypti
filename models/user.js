/**
 * Constructor
 */
function user(){

}
function auth(username, pswrd){
    getHash(username + pswrd);

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

module.exports = user();