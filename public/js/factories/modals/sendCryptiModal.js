webApp.factory('sendCryptiModal', function (btfModal) {
    return btfModal({
        controller: 'sendCryptiController',
        templateUrl: '/partials/modals/sendCrypti.html'
    });
});