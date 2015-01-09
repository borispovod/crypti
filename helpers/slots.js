module.export = {

	interval: 10,

	delegates: 101,

	getTime: function(time){
		var d = time ? (new Date(time)) : (new Date());
		return Math.floor(d.getTime() / 1000);
	},

	getSlotNumber: function(time){
		var t = time ? time : this.getTime();
		return Math.floor(t / this.interval);
	},

	getSlotTime: function(slot){
		return slot * this.interval;
	},

	getNextSlot: function(){
		var slot = this.getSlotNumber();
		var startCurrentSlot = this.getSlotTime(slot);
		if (startCurrentSlot <= this.getTime()){
			slot += 1;
		}
		return slot;
	},

	getLastSlot: function(nextSlot){
		return nextSlot * this.delegates;
	}
}