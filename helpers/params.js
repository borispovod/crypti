var util = require('util');

module.exports = {
	int: function (val) {
		var res = parseInt(val, 10);
		return isNaN(res) ? 0 : res;
	},
	string: function (val) {
		return (val || '').toString();
	},
	bool: function (val) {
		var res = ((val + '').toLowerCase() == "false" || (val + '').toLowerCase() == "f") ? false : val;
		return !!res;
	},
	float: function (val) {
		var res = parseFloat(val);
		return isNaN(res) ? 0 : res;
	},
	buffer: function (val, mode) {
		try {
			var res = new Buffer(val || '', mode)
		} catch (e) {
			var res = new Buffer('');
		}
		return res;
	},
	object: function (val) {
		var res = Object.prototype.toString.call(val) == "[object Object]" ? val : {};
		return res;
	},

	array: function (val) {
		return util.isArray(val) ? val : [];
	},

	variant: function (val) {
		var res = val === undefined ? '' : val;
		return res;
	}
}