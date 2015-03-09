
var cryptiEpoch = Date.UTC(2014, 4, 2, 0, 0, 0, 0);

/**
 * Get time from Crypti epoch.
 * @param {number|undefined} time Time in unix seconds
 * @returns {number}
 */
function getEpochTime(time) {
	if (typeof time === 'undefined') {
		time = Date.now();
	}
	var d = new Date(cryptiEpoch);
	var t = d.getTime();
	return Math.floor((time - t) / 1000);
}

module.exports = {

	interval: 10,

	delegates: 3,

	getTime: function (time) {
		return getEpochTime(time);
	},

	getRealTime: function (epochTime) {
		if (typeof epochTime === 'undefined') {
			epochTime = this.getTime()
		}
		var d = (new Date(cryptiEpoch)).getTime();
		var t = Math.floor(d / 1000) * 1000;
		return t + epochTime * 1000;
	},

	getSlotNumber: function (epochTime) {
		if (typeof epochTime === 'undefined') {
			epochTime = this.getTime()
		}
		return Math.floor(epochTime / this.interval);
	},

	getSlotTime: function (slot) {
		return slot * this.interval;
	},

	getNextSlot: function () {
		var slot = this.getSlotNumber();

		return slot + 1;
	},

	getLastSlot: function (nextSlot) {
		return nextSlot + this.delegates;
	}
}