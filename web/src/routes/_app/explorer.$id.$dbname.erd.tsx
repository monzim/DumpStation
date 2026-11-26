import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Network, RefreshCw } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { BlockSkeleton, Empty } from '@/components/states'
import { explorerPaths, useServer, useServerERD } from '@/components/explorer/api'
import { RemoteError } from '@/components/explorer/parts'
import { ErdView } from '@/components/explorer/ErdView'

export const Route = createFileRoute('/_app/explorer/$id/$dbname/erd')({ component: ErdPage })

function ErdPage() {
  const { id, dbname } = Route.useParams()
  const server = useServer(id)
  const erd = useServerERD(id, dbname)
  const paths = explorerPaths(id)
  const tables = erd.data?.tables?.length ?? 0
  const relations = erd.data?.relations?.length ?? 0

  return (
    <Page>
      <PageHeader
        title={`${dbname} schema`}
        crumbs={[
          { label: 'DB Explorer', href: '/explorer' },
          { label: server.data?.name ?? 'Server', href: paths.server },
          { label: dbname, href: paths.db(dbname) },
          { label: 'Schema diagram' },
        ]}
        description={
          erd.data
            ? `${tables} ${tables === 1 ? 'table' : 'tables'} · ${relations} foreign-key ${relations === 1 ? 'relation' : 'relations'}. Composite keys show their first column pair.`
            : 'Tables, primary keys and foreign-key relations.'
        }
        actions={<Button label="Refresh" icon={<RefreshCw size={14} />} onClick={() => erd.refetch()} isLoading={erd.isFetching && !erd.isLoading} />}
      />
      {erd.isLoading ? (
        <BlockSkeleton height={420} />
      ) : erd.error ? (
        <RemoteError error={erd.error} onRetry={() => erd.refetch()} what="the schema" />
      ) : !tables ? (
        <Card>
          <Empty
            title="No tables to diagram"
            description="This database has no user tables yet."
            icon={<Network size={28} />}
            actions={<Button label="Back to database" href={paths.db(dbname)} />}
          />
        </Card>
      ) : (
        <ErdView erd={erd.data!} />
      )}
    </Page>
  )
}
