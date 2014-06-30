webApp.controller('addressModalController', ["$scope", "addressModal", "$http", function ($scope, addressModal, $http) {
    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        addressModal.deactivate();
    }

    $scope.newAddress = function () {
        $http.get("/api/newAddress", { params : { secretPharse : $scope.secretPhrase }})
            .then(function (resp) {
                if ($scope.destroy) {
                    $scope.destroy();
                }

                addressModal.deactivate(resp.data.address);
            });
    }
}]);