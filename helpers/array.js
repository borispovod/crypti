/**
 * @overview Helpers array tool
 * @author Crypti
 * @license BSD
 * @module Helpers.Array
 * @title Helpers Array
 */

/**
 * Get object property values as array.
 * @param {object} hash
 * @returns {Array}
 * @public
 */
function hash2array(hash) {
    var array = Object.keys(hash).map(function (v) {
        return hash[v];
    });

    return array || [];
}

module.exports = {
    hash2array: hash2array,
    /**
     * Extend object with another object
     * @param {object} target Target object to extend
     * @returns {object} Target object
     * @public
     */
    extend: function (target) {
        var sources = [].slice.call(arguments, 1);
        sources.forEach(function (source) {
            for (var prop in source) {
                target[prop] = source[prop];
            }
        });
        return target;
    }
};