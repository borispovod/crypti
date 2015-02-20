require('angular');

angular.module('webApp').controller('passphraseController', ['$scope', '$rootScope', '$http', "$state", "userService", "cryptoService",
    function ($rootScope, $scope, $http, $state, userService, cryptoService) {
        $scope.login = function (pass) {
            var data = {secret: pass};
            if (!pass || pass.length > 100) {
            }
            else {
				var publicKey = cryptoService.makePublicKey(data.secret);
				var address = cryptoService.makeAddress(publicKey);

				userService.setData(address, publicKey.toString('hex'), 0, 0);
				$state.go('main.account');
            }
        }
    }]);