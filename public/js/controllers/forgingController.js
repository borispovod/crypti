webApp.controller('forgingController', ['$scope', '$rootScope', '$http', "userService", "$interval", "companyModal", "forgingModal", function($rootScope, $scope, $http, userService, $interval, companyModal, forgingModal) {
    $scope.address = userService.address;
    $scope.effectiveBalance = userService.effectiveBalance;
    $scope.totalBalance = userService.balance;
    $scope.unconfirmedBalance = userService.unconfirmedBalance;
	$scope.loadingBlocks = true;

	$scope.getBlocks = function () {
		$http.get("/api/blocks", { params : { generatorPublicKey : userService.publicKey, limit : 20, orderBy: "height:desc" }})
			.then(function (resp) {
				$scope.blocks = resp.data.blocks;
				$scope.loadingBlocks = false;
			});
	}

	$scope.getForgedAmount = function () {
		$http.get("/api/blocks/getForgedByAccount", { params : { generatorPublicKey : userService.publicKey }})
			.then(function (resp) {
				$scope.totalForged = resp.data.sum;
			})
	}

	/*
    $scope.getInfo = function () {
        $http.get("/api/getMiningInfo", { params : { publicKey : userService.publicKey, descOrder : true }})
            .then(function (resp) {
                $scope.blocks = resp.data.blocks;
                $scope.companies = resp.data.companies;
                $scope.totalForged = resp.data.totalForged;
                $scope.forging = resp.data.forging;
            });
    }
    */

    $scope.infoInterval = $interval(function () {
        $scope.getBlocks();
		$scope.getForgedAmount();
    }, 1000 * 30);

    $scope.getBlocks();
	$scope.getForgedAmount();

    $scope.newCompany = function () {
        $scope.companyModal = companyModal.activate({
            totalBalance: $scope.unconfirmedBalance,
            destroy : function () {
                $scope.getInfo();
            }
        });
    }

}]);