
function getEpochTime(time) {
	var d = new Date(Date.UTC(2014, 4, 2, 0, 0, 0, 0));
	var t = d.getTime();
	return parseInt((time - t) / 1000);
}

function getNow() {
	return getEpochTime(new Date().getTime());
}

function epochTime() {
	var d = new Date(Date.UTC(2014, 4, 2, 0, 0, 0, 0));
	var t = parseInt(d.getTime() / 1000);

	return t;
}

module.exports = {
	getEpochTime: getEpochTime,
	epochTime : epochTime,
	getNow : getNow
}