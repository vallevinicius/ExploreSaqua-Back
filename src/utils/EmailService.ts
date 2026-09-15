import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  private getHtmlTemplate(
    templateName: string,
    replacements: Record<string, string>,
  ): string {
    const filePath = path.join(
      __dirname,
      `../templates/emails/${templateName}.html`,
    );
    let htmlContent = fs.readFileSync(filePath, "utf-8");

    for (const [key, value] of Object.entries(replacements)) {
      htmlContent = htmlContent.split(`[${key}]`).join(value);
    }

    return htmlContent;
  }

  public async sendConfirmationEmail(to: string, token: string): Promise<void> {
    const confirmationUrl = `${process.env.FRONTEND_URL}/confirmar-conta?token=${token}`;

    const htmlContent = this.getHtmlTemplate("confirmacao", {
      LINK_CONFIRMACAO: confirmationUrl,
    });

    const message = {
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Confirmação de Cadastro - ExploreSaqua",
      html: htmlContent,
    };

    await this.transporter.sendMail(message);
  }

  public async sendPasswordResetEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/redefinir-senha?token=${token}`;

    const htmlContent = this.getHtmlTemplate("redefinir-senha", {
      LINK_REDEFINIR: resetUrl,
    });

    const message = {
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Redefinição de Senha - ExploreSaqua",
      html: htmlContent,
    };

    await this.transporter.sendMail(message);
  }

  public async sendEmailChangeConfirmationEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const confirmationUrl = `${process.env.FRONTEND_URL}/confirmar-novo-email?token=${token}`;

    const htmlContent = this.getHtmlTemplate("alterar-email", {
      LINK_ALTERAR_EMAIL: confirmationUrl,
    });

    const message = {
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Confirmação de Alteração de E-mail - ExploreSaqua",
      html: htmlContent,
    };

    await this.transporter.sendMail(message);
  }

  public async sendGenericEmail(options: EmailOptions): Promise<void> {
    const message = {
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };
    await this.transporter.sendMail(message);
  }

  public async sendLocalApprovedEmail(
    to: string,
    nomeResponsavel: string,
    nomeLocal: string,
    adminEdited: boolean = false,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("local-aprovado", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_LOCAL: nomeLocal,
      AVISO_EDICAO: adminEdited
        ? " (com algumas edições do administrador)"
        : "",
    });

    await this.transporter.sendMail({
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to,
      subject: "Seu cadastro no ExploreSaqua foi Aprovado!",
      html: htmlContent,
    });
  }

  public async sendLocalUpdateApprovedEmail(
    to: string,
    nomeResponsavel: string,
    nomeLocal: string,
    adminEdited: boolean = false,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("local-atualizado", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_LOCAL: nomeLocal,
      AVISO_EDICAO: adminEdited
        ? " (com algumas edições do administrador)"
        : "",
    });

    await this.transporter.sendMail({
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to,
      subject: "Sua solicitação de atualização no ExploreSaqua foi Aprovada!",
      html: htmlContent,
    });
  }

  public async sendLocalDeletedEmail(
    to: string,
    nomeResponsavel: string,
    nomeLocal: string,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("local-excluido", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_LOCAL: nomeLocal,
    });

    await this.transporter.sendMail({
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to,
      subject: "Seu local foi removido da plataforma ExploreSaqua",
      html: htmlContent,
    });
  }

  public async sendLocalRejectedEmail(
    to: string,
    nomeLocal: string,
    motivo: string | undefined,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("local-rejeitado", {
      NOME_LOCAL: nomeLocal,
      MOTIVO_REJEICAO:
        motivo || "Para mais detalhes, por favor, entre em contato conosco.",
    });

    await this.transporter.sendMail({
      from: `"ExploreSaqua" <${process.env.MAIL_USER}>`,
      to,
      subject: "Sua solicitação no ExploreSaqua foi Rejeitada",
      html: htmlContent,
    });
  }
}

export default new EmailService();
