# جدول‌های D1 ← قابلیت

> خودکار. «نوشتن» از INSERT/UPDATE/DELETE/ALTER و «خواندن» از FROM/JOIN در کدِ قابلیت.

| جدول | می‌نویسند | می‌خوانند |
|---|---|---|
| ai_agents | engine.ai، infra.core، support.ai، support.fb | corr.main، expert.account، expert.detail، expert.tray، manager.asg، manager.desk، sup.panel، support.app، support.exp، support.req |
| ai_calls | engine.ai، infra.core، support.ai، support.fb | support.use |
| ai_feedback | engine.strategy، support.cr، support.fb | — |
| ai_log | corr.main، engine.ai، infra.core، support.ai | — |
| ai_props | corr.main، engine.ai، expert.ai، infra.core | bot.team، sup.panel، support.ai |
| ai_rates | corr.main، engine.ai | expert.letter، infra.core، support.fb |
| ai_runs | corr.main، engine.ai، expert.ai، expert.finalcall، infra.core، sup.panel، support.ai، support.dl، support.fb، support.rules | expert.detail، expert.tray، manager.asg، manager.desk، support.md، support.req، support.use |
| ai_threads | corr.main، engine.ai، infra.core، support.ai، support.fb | expert.detail، expert.picks، sup.panel، support.app، support.chat، support.req |
| alarms | infra.core، manager.log، notify.alarms، support.log | manager.desk، support.req |
| alerts | bot.team، engine.ai، expert.alerts، expert.smart، infra.core، manager.desk، manager.log | — |
| assignment_log | engine.records | — |
| assignments | bot.team، engine.ai، engine.tender، expert.alerts، expert.comm، expert.detail، expert.tray، infra.core، manager.asg، manager.desk، manager.log، support.td | corr.main، engine.records، engine.structure، expert.account، expert.ai، expert.finalcall، expert.history، expert.letter، expert.picks، expert.quotes، expert.smart، expert.team، expert.terms، login.supplier، manager.experts، manager.import، manager.reports، sup.panel، support.ai، support.app، support.chat، support.chg، support.cm، support.dl، support.exp، support.fb، support.req، support.use |
| auth_fails | infra.auth، infra.site | — |
| cat_codes | — | engine.catalog |
| cat_guilds | — | engine.catalog |
| cat_heads | — | engine.catalog، engine.tender، expert.detail |
| cat_titles | — | engine.catalog |
| cat_words | — | engine.catalog |
| closures | engine.records | — |
| commission_notes | infra.core، manager.desk، support.cm | — |
| commission_packages | expert.finalcall | — |
| commission_results | infra.core، manager.desk، support.cm | support.app |
| commission_tables | engine.records | — |
| counters | engine.structure، expert.comm، infra.core، legal.app، manager.import | — |
| cr_cache | engine.strategy، support.cr | — |
| cr_codes | — | engine.strategy |
| cr_docs | engine.strategy، support.cr | manager.log |
| cr_facts | engine.strategy، infra.core | corr.main، engine.ai، sup.panel |
| cr_head_x | support.cr | engine.ai، engine.strategy |
| cr_heads | — | engine.ai، engine.strategy، expert.smart، support.cr، support.sup |
| cr_imports | — | — |
| cr_prices | — | engine.strategy |
| cr_turns | engine.strategy، infra.core | corr.main، engine.ai، sup.panel |
| cr_units | — | engine.strategy، expert.picks، expert.smart، support.cr |
| decisions | expert.detail، infra.core، manager.desk، manager.log | engine.ai، expert.ai، expert.picks، support.ai، support.req |
| events | bot.team، corr.main، engine.ai، engine.records، engine.strategy، engine.tender، expert.account، expert.ai، expert.detail، expert.finalcall، expert.letter، expert.quotes، expert.smart، expert.terms، infra.core، login.tender، manager.desk، manager.experts، manager.log، sup.panel، support.ai، support.app، support.cm، support.cr، support.dl، support.finalcall، support.md، support.rank، support.rules، support.size، support.smartgate، support.sup، support.sw، support.td، tender.page | support.use |
| expert_scores | infra.core، manager.experts | engine.records، manager.desk، support.req |
| experts | bot.team، engine.ai، expert.account، expert.ai، expert.alerts، expert.finalcall، infra.core، manager.experts، support.exp، support.finalcall | bot.sp، engine.records، engine.tender، expert.comm، expert.detail، expert.letter، expert.quotes، expert.smart، expert.team، expert.terms، expert.tray، infra.auth، login.expert، login.supplier، login.tender، manager.asg، manager.desk، manager.import، manager.log، manager.reports، notify.alarms، sup.panel، support.ai، support.app، support.cm، support.dl، support.fb، support.log، support.req، support.smartgate، support.td، support.use، tender.page |
| final_call_sups | expert.finalcall، sup.panel | expert.comm، expert.letter |
| final_calls | expert.finalcall | engine.ai، expert.comm، expert.letter، sup.panel |
| fm_choice | expert.ai، infra.core، manager.desk | — |
| guild_classes | — | engine.catalog |
| help_msgs | bot.help | — |
| hist_imports | engine.catalog | expert.history، manager.reports |
| holidays | infra.core، manager.alerts | manager.desk، manager.reports، support.usd |
| imports | infra.core، manager.import | manager.desk، support.req |
| item_changes | engine.structure، expert.detail، infra.core | support.chg |
| item_edits | engine.structure، expert.detail | engine.catalog |
| items | bot.team، engine.ai، engine.structure، engine.tender، expert.ai، expert.detail، expert.picks، expert.smart، expert.terms، infra.core، manager.asg، manager.desk، manager.import، manager.log، support.ai، support.app، support.cm، support.td | corr.main، engine.records، engine.strategy، expert.account، expert.alerts، expert.comm، expert.finalcall، expert.history، expert.letter، expert.quotes، expert.team، expert.tray، manager.experts، manager.reports، sup.panel، support.chg، support.dl، support.exp، support.fb، support.md، support.req، support.rules، support.use |
| legal_calls | legal.app | — |
| legal_chats | legal.app | — |
| legal_files | legal.app | — |
| legal_turns | legal.app | — |
| letters | bot.team، engine.ai، expert.letter، infra.core، manager.desk | corr.main، expert.comm، support.ai، support.dl، support.fb، support.use |
| norm_cache | engine.structure | — |
| offpf | expert.finalcall، sup.panel | bot.sp، infra.core |
| outbox | bot.team، engine.ai، infra.core، manager.desk، notify.telegram، sup.panel | — |
| phone_channel_log | engine.records، expert.quotes | — |
| phone_channels | engine.records، expert.quotes | expert.smart |
| price_index | — | — |
| proformas | bot.team، expert.quotes، infra.core، manager.desk، sup.panel | corr.main، expert.detail، expert.team، expert.tray، support.app، support.exp، support.req، support.use |
| purchase_history | — | — |
| purchases | — | engine.catalog، engine.strategy، engine.tender، expert.history، manager.reports، support.cr، support.td |
| push_out | notify.push | — |
| push_subs | notify.push | — |
| quote_edits | bot.team، expert.finalcall، expert.quotes، infra.core | — |
| quotes | bot.team، engine.ai، engine.records، engine.tender، expert.finalcall، expert.quotes، infra.core، manager.desk، sup.panel، support.td | corr.main، expert.comm، expert.detail، expert.letter، expert.team، expert.tray، support.app، support.cm، support.dl، support.exp، support.req، support.rules |
| quotes_deleted | engine.records | — |
| req_hist | expert.history، infra.core، manager.desk | manager.reports |
| requests | expert.detail، infra.core، manager.asg، manager.desk، manager.import | bot.team، corr.main، engine.ai، engine.structure، engine.tender، expert.comm، expert.finalcall، expert.letter، expert.quotes، expert.team، expert.tray، manager.experts، manager.log، manager.reports، sup.panel، support.ai، support.app، support.chat، support.chg، support.cm، support.dl، support.exp، support.fb، support.req، support.td، support.use |
| scores_history | engine.records | — |
| search_suppliers | engine.records، infra.core | — |
| settings | bot.sp، bot.team، bot.voice، corr.main، engine.catalog، engine.strategy، engine.structure، engine.tender، expert.finalcall، expert.smart، expert.team، infra.core، infra.site، login.supplier، login.support، manager.alerts، manager.reports، notify.alarms، notify.push، sup.panel، support.app، support.cr، support.finalcall، support.log، support.md، support.rank، support.rules، support.size، support.smartgate، support.sw، support.usd | engine.ai، engine.records، expert.ai، expert.comm، expert.letter، expert.picks، manager.desk، manager.log، support.cm، support.req |
| settings_history | engine.records | — |
| smart_jobs | bot.team، infra.core، manager.desk | — |
| smart_searches | engine.records، expert.smart، infra.core، manager.desk | engine.ai، support.use |
| sp_bundles | corr.main، infra.core، sup.panel | bot.sp، engine.ai، engine.strategy، support.ai، support.app، support.chat، support.cm |
| sp_files | infra.core، sup.panel | bot.sp، support.app، support.chat |
| sp_lines | corr.main، expert.finalcall، infra.core، sup.panel | bot.sp، engine.ai، engine.strategy، expert.detail، expert.picks، expert.terms، login.tender، support.ai، support.app، support.chat، support.fb، support.rules، tender.page |
| sp_links | bot.sp، corr.main، sup.panel | — |
| sp_msgs | expert.finalcall، infra.core، sup.panel، support.cm | bot.sp، corr.main، engine.ai، support.ai، support.app، support.chat، support.fb |
| sp_passes | login.supplier، sup.panel | — |
| sp_phones | corr.main، engine.ai، login.supplier، sup.panel، support.ai، support.fb | bot.sp، engine.tender، expert.finalcall، expert.picks، support.cm، support.sup، support.use |
| sp_phones_x | sup.panel | — |
| sp_sessions | login.supplier، sup.panel | — |
| sp_sms | corr.main، expert.finalcall، infra.core، login.supplier، sup.panel | engine.ai، support.ai، support.fb، support.use |
| sp_suppliers | sup.panel | bot.sp، corr.main، engine.ai، engine.strategy، engine.tender، expert.detail، expert.finalcall، expert.picks، expert.terms، login.supplier، support.ai، support.app، support.chat، support.cm، support.cr، support.exp، support.fb، support.sup، support.td، support.use |
| sp_tg | bot.sp، corr.main، infra.core، login.supplier، login.tender، sup.panel، tender.page | engine.ai، engine.tender، infra.auth |
| sp_threads | corr.main، expert.finalcall، infra.core، sup.panel، support.cm | bot.sp، bot.team، engine.ai، engine.strategy، expert.ai، expert.detail، expert.picks، expert.terms، login.supplier، manager.desk، support.ai، support.app، support.chat، support.exp، support.fb، support.req، support.rules، support.use |
| sreg | support.cr | engine.strategy، expert.picks، expert.smart، support.sup |
| sreg_alias | support.cr | support.sup |
| sreg_edges | support.cr | engine.strategy، expert.picks |
| sreg_ops | support.cr | engine.strategy |
| sreg_x | — | expert.smart، support.cr |
| supplier_channels | — | — |
| supplier_grades | — | engine.tender، support.cr، support.sup، support.td |
| supplier_over | support.sup | support.cr |
| supplier_phones | engine.records | bot.team، engine.ai |
| suppliers | — | engine.tender، expert.history، support.sup، support.td |
| templates | bot.team، expert.ai، expert.msgtpl، infra.core | support.use |
| tender_bids | engine.tender، support.td | login.tender، tender.page |
| tender_invites | engine.tender، login.tender، support.td، tender.page | — |
| tender_jobs | engine.tender، support.td | — |
| tender_sessions | engine.tender، login.tender، support.td، tender.page | — |
| tenders | engine.tender، manager.desk، support.td | — |
| tg_flows | bot.team، infra.core، manager.desk | — |
| tg_nav | bot.team، infra.core، manager.desk | — |
| tg_seen | bot.sp، bot.team، bot.voice، infra.core | — |
| tg_tokens | bot.team، expert.team | — |
| tg_uploads | bot.team، infra.core، manager.desk | — |
| tpl_prefs | expert.ai | expert.msgtpl |
| usd_rates | support.usd | — |
| vb_chats | bot.voice | — |
| voice_jobs | bot.sp، bot.voice | support.use |
| weights | infra.core، manager.experts | engine.records، manager.desk، support.req |
