# PictuRAS - Relatorio Arquitetural (Fase 2)

## Contexto e objetivo
Este relatorio descreve a arquitetura da solucao implementada para a Fase 2 do PictuRAS, focando:
- Manutencao corretiva (T-01, T-03, T-06, T-10).
- Novo caso de uso UC07 (Partilhar Projeto) e requisitos associados.
- Decisoes arquiteturais e cobertura dos requisitos.

Os diagramas estao em `docs/diagrams/*.drawio` (abrir no draw.io).

## Design decisions

### Padrao arquitetural
O sistema segue uma arquitetura de microservicos com API Gateway e processamento assincro via RabbitMQ. A UI (Next.js) comunica com o API Gateway, que encaminha para servicos dedicados (users, projects, subscriptions, image storage). O processamento de imagem ocorre em servicos de ferramentas (Tools) e notifica o frontend por WebSocket (wsGateway).

Impacto em requisitos nao funcionais:
- Desempenho (RNF43): filas assincro e processamento paralelo por ferramenta.
- Escalabilidade: servicos stateless permitem escala horizontal.
- Disponibilidade: falhas isoladas por servico.
- Seguranca (RNF44/RNF49): links com tokens aleatorios + canais HTTPS entre servicos.

### Alocacao funcional de requisitos (exemplos relevantes)

| Requisito | Descricao | Componentes | Justificacao |
| --- | --- | --- | --- |
| RF48 | Opcao "Partilhar projeto" | Frontend | Responsabilidade de UI/entrada do caso de uso |
| RF50/RNF46 | Bloquear partilha com alteracoes nao guardadas | Frontend + Projects | UI detecta modal aberto, backend valida flag |
| RF51 | Selecao de permissao (ver/editar) | Frontend | Interacao com utilizador |
| RF52 | Geracao de link | Projects | Gera token seguro e persiste |
| RF53 | Acesso por link | API Gateway + Projects | Endpoints publicos de partilha |
| RF54 | Gestao de links | Frontend + Projects | Listagem/revogacao |
| RF55/RF56 | Revogar acesso/invalidacao | Projects | Atualiza estado do token |
| RF57 | Erro de link invalido | Frontend + Projects | Mensagem de erro clara |
| T-01/T-10 | Cancelar processamento | Frontend + Projects + wsGateway | UI cancela, backend marca run cancelado |
| T-06 | Reordenar ferramentas | Frontend + Projects | UI reordena e backend persiste |

### Alocacao de requisitos nao funcionais

| Requisito | Componentes | Taticas aplicadas |
| --- | --- | --- |
| RNF49 | Projects + Frontend | Token 32 bytes (64 hex), nao adivinhavel |
| RNF50 | Projects | Geracao imediata (crypto) |
| RNF52 | Projects + MongoDB | Persistencia de links em base de dados |
| RNF53 | Frontend + Projects + wsGateway | Estrategia last-write-wins com atualizacao por websocket |
| RNF43/T-03 | Projects + Tools | Paralelizacao de downloads + metrica de tempo |

## Building Block View
Diagrama: `docs/diagrams/building-block.drawio`

Resumo:
- Frontend (Next.js) comunica com API Gateway.
- API Gateway encaminha para Users, Projects, Subscriptions, Image Storage.
- Projects gere pipeline, partilhas, runs e comunicacao com Tools via RabbitMQ.
- wsGateway publica eventos (process, preview, project-update).
- MongoDB persiste utilizadores, projetos, links de partilha e metricas.

## Runtime View - Colaboracao (UC07)
Diagrama: `docs/diagrams/runtime-uc07.drawio`

Fluxo principal:
1. Utilizador abre projeto e seleciona "Partilhar projeto".
2. Frontend envia permissao e estado "unsaved".
3. Projects cria token (link) e persiste.
4. Destinatario abre `/share/:token` (sem autenticacao).
5. Frontend carrega projeto e, se permissao = editar, permite alterar pipeline.
6. Alteracoes sao persistidas no Projects e disseminadas por `project-update`.
7. Estrategia de concorrencia: last-write-wins (o ultimo update substitui o estado).

## Runtime View - Cancelamento
Diagrama: `docs/diagrams/runtime-cancel.drawio`

Fluxo:
1. UI exibe botao "Cancelar" apos 10s de processamento.
2. Frontend chama `/process/cancel` (ou `/preview/cancel`).
3. Projects marca run como cancelado e limpa a fila de processos pendentes.
4. wsGateway notifica cliente com `process-canceled`/`preview-canceled`.
5. Respostas tardias das Tools sao ignoradas (run_id nao corresponde).

## Deployment View
Diagrama: `docs/diagrams/deployment.drawio`

Resumo:
- Containers Docker para frontend, apiGateway, users, projects, subscriptions, wsGateway.
- MinIO para storage de imagens.
- RabbitMQ para mensageria.
- MongoDB para persistencia de dados.
- Nginx como reverse proxy/load balancer.

## Analise critica (cobertura)

| Item | Implementado | Observacoes |
| --- | --- | --- |
| T-01 | Sim | Cancelamento de processamentos via endpoints e WS |
| T-03 | Parcial | Metricas + paralelizacao; falta validacao de desempenho |
| T-06 | Sim | Reordenacao no pipeline + preview imediato |
| T-10 | Sim | Botao de cancelamento apos 10s |
| RF48 | Sim | Botao de partilha na UI |
| RF50/RNF46 | Sim | Bloqueio com modal aberto (unsaved) |
| RF51 | Sim | Selecao de permissao (ver/editar) |
| RF52 | Sim | Token seguro e persistente |
| RF53 | Sim | Acesso por link com modo view/edit |
| RF54 | Sim | Listagem e gestao de links |
| RF55/RF56 | Sim | Revogacao invalida link |
| RF57 | Sim | Mensagem clara em link invalido |
| RNF49 | Sim | Tokens longos (64 hex) |
| RNF50 | Sim | Geracao local imediata |
| RNF52 | Sim | Persistencia em MongoDB |
| RNF53 | Sim (LWW) | Sem locking/CRDT; risco de overwrite |

## Observacoes finais
- A estrategia de concorrencia e last-write-wins, adequada para MVP mas com risco de sobrescrita.
- O desempenho foi melhorado com paralelizacao e instrumentacao, mas precisa testes para cumprir RNF43/T-03.
