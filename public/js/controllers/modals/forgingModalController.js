require('angular');

angular.module('webApp').controller('forgingModalController', ["$scope", "forgingModal", "$http", "userService", function ($scope, forgingModal, $http, userService) {
	$scope.error = null;
	$scope.forging = userService.forging;

	$scope.close = function () {
		if ($scope.destroy) {
			$scope.destroy();
		}

		forgingModal.deactivate();
	}

	$scope.startForging = function () {
		$scope.error = null;

		if ($scope.forging) {
			return $scope.stopForging();
		}

		$http.post("/api/delegates/forging/enable", { secret : $scope.secretPhrase, publicKey : userService.publicKey })
			.then(function (resp) {
				userService.setForging(resp.data.success);
				$scope.forging = resp.data.success;

				if (resp.data.success) {
					if ($scope.destroy) {
						$scope.destroy();
					}

					forgingModal.deactivate();
				} else {
					$scope.error = resp.data.error;
				}
			});
	}

	$scope.stopForging = function () {
		$scope.error = null;

		$http.post("/api/delegates/forging/disable", { secret : $scope.secretPhrase, publicKey : userService.publicKey })
			.then(function (resp) {
				userService.setForging(!resp.data.success);
				$scope.forging = !resp.data.success;

				if (resp.data.success) {
					if ($scope.destroy) {
						$scope.destroy();
					}

					$scope.forging = !resp.data.success;
					forgingModal.deactivate();
				} else {
					$scope.error = resp.data.error;
				}
			});
	}
}]);