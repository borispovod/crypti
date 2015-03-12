require('angular');

angular.module('webApp').factory('peerFactory',[function () {
	var peer = {
		ip : "130.211.104.33",
		port : "7040"
	};

	var url = "http://" + peer.ip + ":" + peer.port + "";
	return {
		peer : peer,
		url : url
	}
}]);