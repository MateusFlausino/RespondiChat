import { legalContact } from "@/lib/legal-contact";
export const dynamic = "force-dynamic";
export default function Privacy() {
  const contact = legalContact();
  return (
    <main className="legal">
      <a href="/">← RespondiChat</a>
      <h1>Privacidade</h1>
      <p>
        O RespondiChat é um painel privado para enviar links de produtos em
        resposta a comentários nos posts da conta profissional autorizada do
        Instagram.
      </p>
      <h2>Dados usados</h2>
      <p>
        Armazenamos a identificação e o nome da conta conectada, a autorização
        de acesso criptografada, os posts sincronizados, produtos e regras
        cadastradas. Para cada resposta, registramos o identificador do
        comentário, identificação e nome do remetente, mensagem enviada, data e
        resultado do envio. O texto original do comentário é usado para
        identificar a palavra-chave e não é armazenado no histórico.
      </p>
      <h2>Finalidade e serviços</h2>
      <p>
        Os dados são usados para executar e acompanhar as automações
        configuradas. O sistema usa a API da Meta, hospedagem na Vercel e o
        banco PostgreSQL escolhido pelo operador. Não há venda de dados nem
        ferramentas de publicidade neste painel.
      </p>
      <h2>Retenção e segurança</h2>
      <p>
        O histórico de respostas é removido após 30 dias pela rotina diária,
        quando ela está configurada e funcionando. Dados de configuração
        permanecem até sua exclusão. Tokens são criptografados no banco e não
        são mostrados no navegador. Cópias de segurança e registros da
        hospedagem seguem as configurações dos respectivos provedores.
      </p>
      <h2>Controle e exclusão</h2>
      <p>
        A conta autorizada pode revogar o acesso pelo Instagram. A opção
        Desconectar no painel remove a autorização, os posts sincronizados e o
        histórico relacionado, e pausa as automações. Consulte{" "}
        <a href="/data-deletion">as instruções de exclusão</a>.
      </p>
      <h2>Operador e contato</h2>
      <p>
        {contact}
      </p>
    </main>
  );
}
