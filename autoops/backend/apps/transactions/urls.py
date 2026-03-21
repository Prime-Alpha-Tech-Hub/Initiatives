from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BankFeedViewSet, TransactionViewSet

router = DefaultRouter()
router.register('feeds',        BankFeedViewSet,    basename='feed')
router.register('transactions', TransactionViewSet,  basename='transaction')
urlpatterns = [path('', include(router.urls))]
