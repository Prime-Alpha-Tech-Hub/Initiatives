from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count
from .models import BankFeed, Transaction
from .tasks import sync_feed, auto_classify_pending


class BankFeedSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BankFeed
        fields = '__all__'
        read_only_fields = ['last_synced', 'sync_count', 'created_at']


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Transaction
        fields = '__all__'
        read_only_fields = ['auto_posted', 'created_at', 'updated_at']


class BankFeedViewSet(viewsets.ModelViewSet):
    queryset           = BankFeed.objects.all()
    serializer_class   = BankFeedSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'feed_type']

    @action(detail=True, methods=['post'])
    def sync(self, request, pk=None):
        sync_feed.delay(pk)
        return Response({'message': 'Sync started.'})


class TransactionViewSet(viewsets.ModelViewSet):
    queryset           = Transaction.objects.all().select_related('feed')
    serializer_class   = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'transaction_type', 'currency', 'strategy']
    search_fields      = ['description', 'counterparty', 'reference']
    ordering_fields    = ['date', 'amount', 'created_at']

    @action(detail=False, methods=['post'])
    def classify_all(self, request):
        auto_classify_pending.delay()
        return Response({'message': 'Auto-classification started.'})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = Transaction.objects.filter(status__in=['posted', 'reconciled'])
        return Response({
            'total_transactions': qs.count(),
            'total_volume':       float(qs.aggregate(s=Sum('amount'))['s'] or 0),
            'by_type': list(qs.values('transaction_type').annotate(
                count=Count('id'), total=Sum('amount')
            )),
            'pending_review': Transaction.objects.filter(status='pending').count(),
        })
