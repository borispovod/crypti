webApp.factory('addressModal', function (btfModal) {
    return btfModal({
        controller: 'addressModalController',
        templateUrl: '/partials/modals/addressModal.html'
    });
});