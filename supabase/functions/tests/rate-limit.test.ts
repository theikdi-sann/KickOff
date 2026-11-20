import { assertEquals } from "@std/assert";

import { RUN, login, requireEnv, rest } from "./_commerce.ts";

Deno.test({
  name: "rate limit: the checkout surface refuses the 11th request in a minute",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);

    const clear = () =>
      rest(env, "rate_limits?key=like.checkout:*", {
        token: env.service,
        method: "DELETE",
      });
    await clear();

    try {
      const statuses: number[] = [];
      for (let index = 0; index < 11; index += 1) {
        const response = await fetch(`${env.url}/functions/v1/stripe-checkout`, {
          method: "POST",
          headers: {
            apikey: env.anon,
            authorization: `Bearer ${fan}`,
            "content-type": "application/json",
          },
          body: "{}",
        });
        statuses.push(response.status);
        await response.arrayBuffer();
      }

      assertEquals(statuses.slice(0, 10), Array(10).fill(422));
      assertEquals(statuses[10], 429, "the 11th checkout request in the window is refused");
    } finally {
      await clear();
    }
  },
});
