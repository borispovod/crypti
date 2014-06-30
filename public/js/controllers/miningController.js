webApp.controller('miningController', ['$scope', '$rootScope', '$http', "userService", "$interval", "addressModal", "forgingModal", function($rootScope, $scope, $http, userService, $interval, addressModal, forgingModal) {
    $scope.address = userService.address;
    $scope.effectiveBalance = userService.effectiveBalance;
    $scope.forging = userService.forging;

    $scope.getInfo = function () {
        $http.get("/api/getMiningInfo", { params : { publicKey : userService.publicKey }})
            .then(function (resp) {
                $scope.blocks = resp.data.blocks;
                $scope.addresses = resp.data.addresses;
                $scope.totalForged = resp.data.totalForged;
                $scope.totalMined = resp.data.totalMined;
            });
    }

    $scope.infoInterval = $interval(function () {
        $scope.getInfo();
    }, 1000 * 60);

    $scope.getInfo();

    $scope.newAddress = function () {
        $scope.addressModal = addressModal.activate({
            destroy : function () {
                $scope.getInfo();
            }
        });
    }

    $scope.enableForging = function () {
        $scope.forgingModal = forgingModal.activate({
            destroy : function () {
                $scope.forging = userService.forging;
            }
        });
    }

}]);