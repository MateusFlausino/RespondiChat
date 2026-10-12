export const dynamic = "force-dynamic";
export default function DataDeletion() {
  return (
    <main className="legal">
      <a href="/">← RespondiChat</a>
      <h1>Exclusão de dados</h1>
      <p>
        Para remover os dados de conexão, abra Configurações no painel e escolha
        Desconectar Instagram. Isso remove o token, os posts importados e o
        histórico de respostas da conta conectada, além de pausar as automações.
      </p>
      <p>
        Produtos e textos das automações podem ser excluídos pelo administrador
        nas respectivas telas. Mensagens já enviadas no Instagram não são
        apagadas por essa operação.
      </p>
      <p>
        Também é possível revogar a autorização nas configurações de aplicativos
        e sites do Instagram. Quando a Meta enviar uma solicitação assinada de
        desautorização ou exclusão ao endereço cadastrado pelo operador, o
        sistema processará a remoção dos dados de conexão.
      </p>
      <p>
        Contato:{" "}
        {process.env.PRIVACY_CONTACT ||
          "o operador deve configurar PRIVACY_CONTACT antes de usar o sistema em produção."}
      </p>
    </main>
  );
}
