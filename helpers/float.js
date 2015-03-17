function toFixed(number, size) {
	var n = number.toString();
	var strs = n.split('.');

	var number = strs[0];
	if (strs[1]) {
		number += "." + strs[1].substring(0, size);
	}

	return parseFloat(number);
}

module.exports = {
	toFixed: toFixed
}