import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import prisma from "../prisma";
import { Prisma } from "@prisma/client";
import ProfanityFilter from "../utils/ProfanityFilter";
import EmailService from "../utils/EmailService";
import {
  IUpdatePasswordRequest,
  IUpdateProfileRequest,
} from "../interfaces/requests";
import { containsEmoji } from "../utils/ValidationEmoji";

class AuthService {
  public async cadastrarUsuario(dadosUsuario: any) {
    if (ProfanityFilter.contemPalavrao(dadosUsuario.username)) {
      throw new Error(
        "Você utilizou palavras inapropriadas no nome de usuário."
      );
    }
    const usernameExistente = await prisma.usuario.findFirst({
      where: { username: dadosUsuario.username, enabled: true },
    });
    if (containsEmoji(dadosUsuario.username)) {
      throw new Error("O nome de usuário não pode conter emojis.");
    }

    if (usernameExistente) {
      throw new Error("Usuário já cadastrado, use outro e tente novamente.");
    }

    const emailExistente = await prisma.usuario.findUnique({
      where: { email: dadosUsuario.email },
    });
    if (emailExistente) {
      if (emailExistente.enabled) {
        throw new Error("Email já cadastrado, use outro e tente novamente.");
      }

      await prisma.usuario.delete({ where: { usuarioId: emailExistente.usuarioId } });
    }

    const utilizadorExistente = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username: dadosUsuario.username },
          { email: dadosUsuario.email },
        ],
      },
    });

    if (utilizadorExistente) {
      if (utilizadorExistente.username === dadosUsuario.username)
        throw new Error("Usuário já cadastrado, use outro e tente novamente.");
      if (utilizadorExistente.email === dadosUsuario.email)
        throw new Error("Email já cadastrado, use outro e tente novamente.");
    }

    const senhaCriptografada = await bcrypt.hash(dadosUsuario.password, 10);
    const tokenConfirmacao = uuidv4();

    const novoUtilizador = await prisma.usuario.create({
      data: {
        nomeCompleto: dadosUsuario.nomeCompleto,
        username: dadosUsuario.username,
        email: dadosUsuario.email,
        password: senhaCriptografada,
        confirmationToken: tokenConfirmacao,
        enabled: false,
      },
    });

    await EmailService.sendConfirmationEmail(
      novoUtilizador.email,
      tokenConfirmacao
    );

    const { password, ...dadosSeguros } = novoUtilizador;
    return dadosSeguros;
  }

  public async login(username: string, pass: string) {
    const utilizador = await prisma.usuario.findFirst({
      where: {
        OR: [{ username: username }, { email: username }],
      },
    });

    if (!utilizador) {
      throw new Error("Usuário ou senha inválidos");
    }

    if (!utilizador.enabled) {
      throw new Error(
        "Sua conta não foi verificada. Verifique seu e-mail. Se não recebeu, clique em reenviar para solicitar um novo e-mail de confirmação."
      );
    }

    const isMatch = await bcrypt.compare(pass, utilizador.password);
    if (!isMatch) {
      throw new Error("Usuário ou senha inválidos");
    }

    const token = jwt.sign(
      { id: utilizador.usuarioId, username: utilizador.username },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "1h" }
    );

    const { password, ...dadosSeguros } = utilizador;
    return { user: dadosSeguros, token };
  }

  public async confirmUserAccount(token: string) {
    const utilizador = await prisma.usuario.findFirst({
      where: { confirmationToken: token },
    });

    if (!utilizador) {
      throw new Error("Token de confirmação inválido ou não encontrado.");
    }

    await prisma.usuario.update({
      where: { usuarioId: utilizador.usuarioId },
      data: { enabled: true, confirmationToken: null },
    });
  }

  public async confirmEmailChange(token: string) {
    const utilizador = await prisma.usuario.findFirst({
      where: { emailChangeToken: token },
    });

    if (!utilizador || !utilizador.unconfirmedEmail) {
      throw new Error(
        "Token de alteração de e-mail inválido ou não encontrado."
      );
    }

    await prisma.usuario.update({
      where: { usuarioId: utilizador.usuarioId },
      data: {
        email: utilizador.unconfirmedEmail,
        unconfirmedEmail: null,
        emailChangeToken: null,
      },
    });
  }

  public async forgotPassword(email: string) {
    const utilizador = await prisma.usuario.findUnique({ where: { email } });

    if (utilizador) {
      const token = uuidv4();
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1);

      await prisma.usuario.update({
        where: { usuarioId: utilizador.usuarioId },
        data: { resetPasswordToken: token, resetPasswordTokenExpiry: expiryDate },
      });
      await EmailService.sendPasswordResetEmail(utilizador.email, token);
    }
  }

  public async resetPassword(token: string, newPassword: string) {
    const utilizador = await prisma.usuario.findFirst({
      where: { resetPasswordToken: token },
    });

    if (!utilizador || !utilizador.resetPasswordTokenExpiry) {
      throw new Error("Token de redefinição de senha inválido ou expirado.");
    }

    if (utilizador.resetPasswordTokenExpiry < new Date()) {
      throw new Error("Token de redefinição de senha expirado.");
    }

    await prisma.usuario.update({
      where: { usuarioId: utilizador.usuarioId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        resetPasswordToken: null,
        resetPasswordTokenExpiry: null,
      },
    });
  }

  public async updateUserProfile(userId: number, data: IUpdateProfileRequest) {
    const utilizador = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!utilizador) throw new Error("Usuário não encontrado.");

    const update: Prisma.UsuarioUpdateInput = {};

    if (data.nomeCompleto) {
      update.nomeCompleto = data.nomeCompleto;
    }

    if (data.username && data.username !== utilizador.username) {
      if (ProfanityFilter.contemPalavrao(data.username)) {
        throw new Error("Você utilizou palavras inapropriadas.");
      }
      const usernameExists = await prisma.usuario.findFirst({
        where: { username: data.username },
      });
      if (usernameExists)
        throw new Error("O novo nome de usuário já está em uso.");
      update.username = data.username;
    }

    if (data.email && data.email.toLowerCase() !== utilizador.email) {
      const emailExists = await prisma.usuario.findFirst({
        where: { email: data.email },
      });
      if (emailExists)
        throw new Error("O novo e-mail já está em uso por outra conta.");

      const token = uuidv4();
      update.unconfirmedEmail = data.email;
      update.emailChangeToken = token;

      await EmailService.sendEmailChangeConfirmationEmail(data.email, token);
    }

    return prisma.usuario.update({ where: { usuarioId: userId }, data: update });
  }

  public async updateUserPassword(
    userId: number,
    request: IUpdatePasswordRequest
  ) {
    const utilizador = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!utilizador) throw new Error("Usuário não encontrado.");

    const isMatch = await bcrypt.compare(
      request.currentPassword,
      utilizador.password
    );
    if (!isMatch) {
      throw new Error("A senha atual está incorreta.");
    }

    await prisma.usuario.update({
      where: { usuarioId: userId },
      data: { password: await bcrypt.hash(request.newPassword, 10) },
    });
  }

  public async deleteUser(userId: number) {
    const utilizador = await prisma.usuario.findUnique({ where: { usuarioId: userId } });
    if (!utilizador) throw new Error("Usuário não encontrado.");

    await prisma.avaliacao.deleteMany({ where: { usuarioId: utilizador.usuarioId } });

    await prisma.usuario.delete({ where: { usuarioId: userId } });
  }
}

export default new AuthService();
