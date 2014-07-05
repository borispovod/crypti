webApp.controller('addressModalController', ["$scope", "addressModal", "$http", "userService", function ($scope, addressModal, $http, userService) {
    $scope.close = function () {
        if ($scope.destroy) {
            $scope.destroy();
        }

        addressModal.deactivate();
    }

    $scope.newAddress = function () {
        $http.get("/api/newAddress", { params : {
            secretPharse : $scope.secretPhrase,
            accountAddress : userService.address
        }}).then(function (resp) {
            if(resp.data.error == "Invalid passphrase, check your passphrase please"){
                $scope.fromServer = resp.data.error;
            }
            else{
                if ($scope.destroy) {
                    $scope.destroy();
                }
                addressModal.deactivate(resp.data.address);
            }
           });
    }
}]);