require('angular');

angular.module('webApp').controller('passphraseController', ['$scope', '$rootScope', '$http', "$state", '$location', "userService", "dbFactory",
	function ($rootScope, $scope, $http, $state, $location, userService, dbFactory) {

		// angular.element(document.getElementById("forgingButton")).show();
		debugger;
		dbFactory.createdb();

		$scope.login = function (pass) {
			var data = {secret: pass};
			if (!pass || pass.length > 100) {
			}
			else {
				var crypti = require('crypti-js');
				var keys = crypti.crypto.getKeys(pass);
				var address = crypti.crypto.getAddress(keys.publicKey);
				userService.setData(address, keys.publicKey);
				$state.go('main.account');
			}
		}
	}]);
