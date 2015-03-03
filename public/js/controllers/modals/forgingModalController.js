require('angular');

angular.module('webApp').controller('forgingModalController', ["$scope", "forgingModal", "$http", "userService", function ($scope, forgingModal, $http, userService) {
    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        forgingModal.deactivate();
    }

    $scope.startForging = function () {
        $http.post("/api/delegates/forging/enable", { secret : $scope.secretPhrase})
            .then(function (resp) {
                userService.setForging(resp.data.success && resp.data.address);

                if ($scope.destroy) {
                    $scope.destroy();
                }

                forgingModal.deactivate();
            });
    }

	$scope.stopForging = function () {
  $http.post("/api/delegates/forging/disable", { secret : $scope.secretPhrase})
            .then(function (resp) {
                userService.setForging(resp.data.success && resp.data.address);

                if ($scope.destroy) {
                    $scope.destroy();
                }

                forgingModal.deactivate();
            });
	}
}]);