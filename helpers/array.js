module.exports = {
	hash2array: function (hash) {
		var array = Object.keys(hash).map(function (v) {
			return hash[v];
		});

		return array || [];
	},

	extend: function (target) {
		var sources = [].slice.call(arguments, 1);
		sources.forEach(function (source) {
			for (var prop in source) {
				target[prop] = source[prop];
			}
		});
		return target;
	}
}