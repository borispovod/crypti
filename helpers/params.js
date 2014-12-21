module.exports = {
	int: function (val) {
		val = parseInt(val, 10);
		return isNaN(val) ? 0 : val;
	},
	string: function (val) {
		return (val || '').toString();
	},
	bool: function (val) {
		val = ((val + '').toLowerCase() == "false" || (val + '').toLowerCase() == "f") ? false : val;
		return !!val;
	},
	float: function (val) {
		val = parseFloat(val);
		return isNaN(val) ? 0 : val;
	},
	buffer: function (val, mode) {
		return new Buffer(val || '', mode);
	},
	object: function (val) {
		val = Object.prototype.toString.call(val) == "[object Object]" ? val : {};
		return val;
	},

	variant: function (val) {
		val = val === undefined ? '' : val;
		return val;
	}
}