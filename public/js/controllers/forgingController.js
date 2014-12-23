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

	$scope.getForging = function () {
		$http.get("/api/forging")
			.then(function (resp) {
				if (resp.data.enabled) {
					if (resp.data.address == userService.address) {
						$scope.forging = true;
					} else {
						$scope.forging = false;
					}
				} else {
					$scope.forging = false;
				}
			});
	}

    $scope.infoInterval = $interval(function () {
        $scope.getBlocks();
		$scope.getForgedAmount();
		$scope.getForging();
    }, 1000 * 30);

    $scope.getBlocks();
	$scope.getForgedAmount();
	$scope.getForging();

    $scope.newCompany = function () {
        $scope.companyModal = companyModal.activate({
            totalBalance: $scope.unconfirmedBalance,
            destroy : function () {
                $scope.getInfo();
            }
        });
    }

}]);