module.exports = {
	/**
	 * Get object property values as array.
	 * @param {object} hash
	 * @returns {Array}
	 */
	hash2array: function (hash) {
		var array = Object.keys(hash).map(function (v) {
			return hash[v];
		});

		return array || [];
	},
	/**
	 * Extend object with another object
	 * @param {object} target Target object to extend
	 * @returns {object} Target object
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