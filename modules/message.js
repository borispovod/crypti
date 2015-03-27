var modules, library, self;

function Message() {

}

function Messages(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	library.logic.transaction.attachAssetType(5, new Delegate());

	setImmediate(cb, null, self);
}

Messages.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Messages;