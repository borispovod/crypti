module.exports = {
	hash2array: function (hash) {
		var array = Object.keys(hash).map(function (v) {
			return hash[v];
		});

		return array || [];
	}
}