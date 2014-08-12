webApp.controller('forgingController', ['$scope', '$rootScope', '$http', "userService", "$interval", "companyModal", "forgingModal", function($rootScope, $scope, $http, userService, $interval, companyModal, forgingModal) {
    $scope.address = userService.address;
    $scope.effectiveBalance = userService.effectiveBalance;
    $scope.totalBalance = userService.balance;
    $scope.forging = userService.forging;

    $scope.getInfo = function () {
        $http.get("/api/getMiningInfo", { params : { publicKey : userService.publicKey, descOrder : true }})
            .then(function (resp) {
                $scope.blocks = resp.data.blocks;
                $scope.companies = resp.data.companies;
                $scope.totalForged = resp.data.totalForged;
            });
    }

    $scope.infoInterval = $interval(function () {
        $scope.getInfo();
    }, 1000 * 60);

    $scope.getInfo();

    $scope.newCompany = function () {
        $scope.companyModal = companyModal.activate({
            totalBalance: $scope.totalBalance,
            destroy : function () {
                $scope.getInfo();
            }
        });
    }

}]);