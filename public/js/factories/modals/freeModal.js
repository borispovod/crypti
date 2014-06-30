webApp.factory('freeModal', function (btfModal) {
    return btfModal({
        controller: 'freeModalController',
        templateUrl: '/partials/modals/freeModal.html'
    });
});