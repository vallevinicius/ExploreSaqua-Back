import { Request, Response } from "express";
import AuthService from "../services/AuthService";

class AuthController {
  public async cadastrar(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.cadastrarUsuario(req.body);
      return res.status(201).json({
        message:
          "Cadastro realizado com sucesso! Por favor, verifique seu e-mail para ativar sua conta.",
      });
    } catch (error: any) {
      if (error.message.includes("já cadastrado")) {
        return res.status(409).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }

  public async login(req: Request, res: Response): Promise<Response> {
    console.log("Dados recebidos no controller:", req.body);

    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Usuário e senha são obrigatórios." });
      }

      const data = await AuthService.login(username, password);

      return res.status(200).json(data);
    } catch (error: any) {
      console.error("Erro no login:", error.message);
      const msg = error?.message || "Ocorreu um erro inesperado.";
      const normalized = msg.toLowerCase();

      // Se for erro de credenciais ou conta não verificada, devolve 401 com a mensagem original
      if (
        normalized.includes("inválid") ||
        normalized.includes("invalid") ||
        normalized.includes("verific") ||
        normalized.includes("nao foi verificada") ||
        normalized.includes("não foi verificada")
      ) {
        return res.status(401).json({ message: msg });
      }

      // Para outros erros, devolve a mensagem também (status 500)
      return res.status(500).json({ message: msg });
    }
  }

  public async confirmAccount(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.confirmUserAccount(req.query.token as string);
      return res.json({
        message: "Conta ativada com sucesso. Você já pode fazer login.",
      });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  public async forgotPassword(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.forgotPassword(req.body.email);
      return res.json({
        message:
          "Se existir uma conta com o e-mail fornecido, um link de redefinição de senha foi enviado.",
      });
    } catch (error: any) {
      return res.json({
        message:
          "Se existir uma conta com o e-mail fornecido, um link de redefinição de senha foi enviado.",
      });
    }
  }

  public async resetPassword(req: Request, res: Response): Promise<Response> {
    try {
      const { token, newPassword } = req.body;
      await AuthService.resetPassword(token, newPassword);
      return res.json({ message: "Senha redefinida com sucesso." });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  public async confirmEmailChange(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      await AuthService.confirmEmailChange(req.query.token as string);
      return res.json({
        message: "Alteração de e-mail confirmada com sucesso.",
      });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }
}

export default new AuthController();