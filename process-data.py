#!/usr/bin/env python3
"""Process Vana data files into summary JSON for the infographic."""

import json
import os
from datetime import datetime, timedelta, timezone
from collections import Counter
from pathlib import Path

VANA_DIR = Path(os.environ.get('VANA_DIR', os.path.expanduser('~/.vana/results')))
NOW = datetime.now(timezone.utc)
D1 = NOW - timedelta(hours=24)
D7 = NOW - timedelta(days=7)
D30 = NOW - timedelta(days=30)


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def load(name):
    path = VANA_DIR / name
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def process_chatgpt():
    data = load('chatgpt.json')
    convos = data.get('chatgpt.conversations', {}).get('conversations', [])
    memories = data.get('chatgpt.memories', {}).get('memories', [])

    models = Counter()
    topics_24h, topics_7d = [], []
    recent_24h, recent_7d = [], []
    hour_dist, day_dist = Counter(), Counter()
    total_msgs = 0
    with_msgs = 0

    for c in convos:
        msgs = c.get('messages', [])
        mc = c.get('message_count', len(msgs))
        if mc > 0:
            with_msgs += 1
            total_msgs += mc
        for m in msgs:
            if m.get('model'):
                models[m['model']] += 1

        created = parse_iso(c.get('create_time'))
        entry = {
            'title': c.get('title', 'Untitled'),
            'created': c.get('create_time', ''),
            'messageCount': mc,
        }

        if created:
            if created >= D1:
                recent_24h.append(entry)
                topics_24h.append(c.get('title', ''))
            if created >= D7:
                recent_7d.append(entry)
                topics_7d.append(c.get('title', ''))
                hour_dist[created.hour] += 1
                day_dist[created.strftime('%a')] += 1

    return {
        'total': len(convos),
        'withMessages': with_msgs,
        'totalMessages': total_msgs,
        'last24h': len(recent_24h),
        'last7d': len(recent_7d),
        'topics24h': topics_24h[:20],
        'topics7d': topics_7d[:30],
        'models': dict(models.most_common(10)),
        'hourDist': {str(k): v for k, v in sorted(hour_dist.items())},
        'dayDist': dict(day_dist.most_common(7)),
        'memories': len(memories),
        'recentConvos7d': sorted(recent_7d, key=lambda x: x.get('created', ''), reverse=True)[:15],
    }


def process_github():
    data = load('github.json')
    repos = data.get('repositories', [])
    profile = data.get('profile', {})

    langs = Counter()
    active_7d, active_30d = [], []

    for r in repos:
        if r.get('language'):
            langs[r['language']] += 1
        updated = parse_iso(r.get('updatedAt'))
        if updated:
            entry = {'name': r['name'], 'language': r.get('language', ''), 'description': r.get('description', ''), 'updated': r['updatedAt']}
            if updated >= D7:
                active_7d.append(entry)
            if updated >= D30:
                active_30d.append(entry)

    return {
        'profile': {
            'username': profile.get('username', ''),
            'fullName': profile.get('fullName', ''),
            'followers': profile.get('followers', 0),
            'following': profile.get('following', 0),
            'repoCount': profile.get('repositoryCount', len(repos)),
        },
        'languages': dict(langs.most_common(10)),
        'active7d': active_7d,
        'active30d': active_30d[:10],
        'totalRepos': len(repos),
        'publicRepos': sum(1 for r in repos if r.get('visibility') == 'Public'),
        'privateRepos': sum(1 for r in repos if r.get('visibility') == 'Private'),
    }


def process_youtube():
    data = load('youtube.json')
    profile = data.get('youtube.profile', {})
    subs = data.get('youtube.subscriptions', {}).get('subscriptions', [])
    playlists = data.get('youtube.playlists', {}).get('playlists', [])
    likes = data.get('youtube.likes', {}).get('likedVideos', [])
    watch_later = data.get('youtube.watchLater', {}).get('watchLater', [])

    channels = Counter()
    for v in likes:
        channels[v.get('channelTitle', '')] += 1

    return {
        'profile': {'handle': profile.get('handle', ''), 'joined': profile.get('joinedDate', ''),
                     'subscribers': profile.get('subscriberCount', 0), 'views': profile.get('viewCount', 0)},
        'subscriptions': len(subs),
        'playlists': [{'title': p.get('title', ''), 'count': p.get('itemCount', 0)} for p in playlists],
        'likedVideos': len(likes),
        'watchLater': len(watch_later),
        'topChannels': dict(channels.most_common(8)),
    }


def process_linkedin():
    data = load('linkedin.json')
    profile = data.get('linkedin.profile', {})
    skills = data.get('linkedin.skills', {}).get('skills', [])
    conns = data.get('linkedin.connections', {}).get('connections', [])

    return {
        'profile': {
            'fullName': profile.get('fullName', ''),
            'headline': profile.get('headline', ''),
            'location': profile.get('location', ''),
            'connections': profile.get('connections', 0),
        },
        'skills': [s.get('name', '') for s in skills],
        'totalConnections': len(conns),
    }


def process_uber():
    data = load('uber.json')
    trips = data.get('uber.trips', {}).get('trips', [])
    receipts = data.get('uber.receipts', {}).get('receipts', [])

    total = 0
    for r in receipts:
        try:
            total += float(r.get('fare', '0').replace('$', '').replace('CA$', '').strip())
        except (ValueError, TypeError):
            pass

    return {
        'totalTrips': len(trips),
        'totalSpent': round(total, 2),
    }


result = {
    'chatgpt': process_chatgpt(),
    'github': process_github(),
    'youtube': process_youtube(),
    'linkedin': process_linkedin(),
    'uber': process_uber(),
    'generated': NOW.isoformat(),
}

print(json.dumps(result))
