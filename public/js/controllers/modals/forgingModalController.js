webApp.controller('forgingModalController', ["$scope", "forgingModal", "$http", "userService", function ($scope, forgingModal, $http, userService) {
    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        forgingModal.deactivate();
    }

    $scope.startForging = function () {
        $http.get("/api/startForging", { params : { secretPharse : $scope.secretPhrase, publicKey : userService.publicKey }})
            .then(function (resp) {
                userService.setForging(resp.data.success);

                if ($scope.destroy) {
                    $scope.destroy();
                }

                forgingModal.deactivate();
            });
    }
}]);