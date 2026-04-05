from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CollectionViewSet, ArticleViewSet

router = DefaultRouter()
router.register('collections', CollectionViewSet, basename='kb-collection')
router.register('articles',    ArticleViewSet,    basename='kb-article')

urlpatterns = [path('', include(router.urls))]
